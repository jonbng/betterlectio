import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio/basic_info.dart';
import 'package:lectio_wrapper/utils/dio_image_provider.dart';
import 'package:betterlectio/topics/contribute/widgets/help_us_bar.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/widgets/layout/text_divider.dart';
import 'package:betterlectio/widgets/loading/student_bloc_builder.dart';
import 'package:betterlectio/widgets/primitive/lpp_shimmer.dart';

import '../../logic/student/student_bloc.dart';
import '../../logic/student/student_cubit.dart';

class Destination {
  Destination(
      {required this.icon,
      required this.name,
      required this.selectedIcon,
      required this.screen,
      this.onlyFromEdge = false,
      this.onTap});
  IconData icon;
  IconData selectedIcon;
  String name;
  Widget screen;
  Function(BuildContext context)? onTap;
  bool onlyFromEdge;
}

class LppDrawer extends StatelessWidget {
  const LppDrawer(
      {super.key,
      required this.destinations,
      required this.relatedDestinations});
  final List<Destination> destinations;
  final List<Destination> relatedDestinations;

  @override
  Widget build(BuildContext context) {
    var combinedDestinations = destinations.take(destinations.length).toList()
      ..addAll(relatedDestinations);
    return NavigationDrawer(
      backgroundColor: Colors.transparent,
      elevation: 0.0,
      selectedIndex: 99,
      onDestinationSelected: (int x) {
        var destination = combinedDestinations.elementAt(x);
        if (destination.onTap != null) {
          destination.onTap!(context);
        } else {
          Navigator.push(
              context,
              adRoute(combinedDestinations.elementAt(x).screen,
                  onlyFromEdge:
                      combinedDestinations.elementAt(x).onlyFromEdge));
        }
      },
      children: [
        const TextDivider(
          text: 'Elev',
          primary: true,
        ),
        SizedBox(
          height: 70.0,
          child: BlocBuilder<StudentBloc, StudentState>(
            builder: (context, studentState) {
              var textTheme = Theme.of(context).textTheme;
              return StudentBlocBuilder<StudentCubit<BasicInfo>, BasicInfo?>(
                  small: true,
                  customLoadingWidget: LppShimmer(
                      enabled: true,
                      child: ListTile(
                        leading: const CircleAvatar(),
                        title: Container(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(4.0),
                            color: Theme.of(context)
                                .colorScheme
                                .secondaryContainer,
                          ),
                          width: 70.0,
                          height: (textTheme.labelLarge?.fontSize ?? 0) *
                              (textTheme.labelLarge?.height ?? 0),
                        ),
                        subtitle: Container(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(4.0),
                            color: Theme.of(context)
                                .colorScheme
                                .secondaryContainer,
                          ),
                          width: 70.0,
                          height: (textTheme.labelMedium?.fontSize ?? 0) *
                              (textTheme.labelMedium?.height ?? 0),
                        ),
                      )),
                  builder: (context, state) {
                    return ListTile(
                      leading: Container(
                        clipBehavior: Clip.antiAlias,
                        decoration: const BoxDecoration(shape: BoxShape.circle),
                        height: 40.0,
                        width: 40.0,
                        child: StudentBlocBuilder<StudentCubit<DioImage>,
                                DioImage?>(
                            small: true,
                            bloc: StudentCubit(
                                student: getStudentBloc(context).state.student!,
                                selector: (student) async =>
                                    student.getImage(state!.pictureId))
                              ..load(),
                            builder: (context, state) {
                              return CircleAvatar(
                                foregroundImage: state,
                              );
                            }),
                      ),
                      title: Text(
                        state?.name ?? "",
                        style: textTheme.labelLarge,
                      ),
                      subtitle: Text(
                        studentState.gymName,
                        style: textTheme.labelMedium!.copyWith(
                            color:
                                Theme.of(context).colorScheme.onSurfaceVariant),
                      ),
                    );
                  });
            },
          ),
        ),
        const TextDivider(
          text: "Skole",
          primary: true,
        ),
        ...destinations.map((e) {
          return NavigationDrawerDestination(
              selectedIcon: Icon(e.selectedIcon),
              icon: Icon(e.icon),
              label: Text(e.name));
        }),
        const TextDivider(
          text: "Andet",
          primary: true,
        ),
        ...relatedDestinations.map((e) {
          return NavigationDrawerDestination(
              selectedIcon: Icon(e.selectedIcon),
              icon: Icon(e.icon),
              label: Text(e.name));
        }),
        const HelpUsBar(),
        const SizedBox(
          height: 20.0,
        )
      ],
    );
  }
}
