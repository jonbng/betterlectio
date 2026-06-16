import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/types/gym.dart';
import 'package:betterlectio/topics/welcome/bloc/login.dart';

import '../../../logic/student/student_bloc.dart';

class SelectGym extends SearchDelegate<Gym> {
  final LoginBloc loginBloc;
  SelectGym(this.loginBloc);

  @override
  List<Widget>? buildActions(BuildContext context) {
    return [];
  }

  @override
  Widget? buildLeading(BuildContext context) {
    return null;
  }

  @override
  Widget buildResults(BuildContext context) {
    return Container();
  }

  @override
  Widget buildSuggestions(BuildContext context) {
    return BlocBuilder<StudentBloc, StudentState>(
      builder: (context, state) {
        List<Gym> matching = state.gyms
            .where((element) =>
                element.name.toLowerCase().contains(query.toLowerCase()))
            .toList();
        return ListView.builder(
          itemCount: matching.length,
          itemBuilder: (context, index) {
            return ListTile(
              onTap: () {
                loginBloc.setGym(matching[index].id);
                close(context, matching[index]);
              },
              title: Text(matching[index].name),
            );
          },
        );
      },
    );
  }
}
