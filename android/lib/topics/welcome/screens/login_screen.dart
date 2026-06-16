import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/topics/welcome/bloc/login.dart';
import 'package:betterlectio/topics/welcome/widgets/illustration.dart';
import 'package:betterlectio/widgets/layout/padded_column.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.back});
  final Function() back;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late TextEditingController usernameController;
  late TextEditingController passwordController;
  late LoginBloc loginBloc;
  bool hidden = true;

  @override
  void initState() {
    super.initState();
    loginBloc = context.read<LoginBloc>();

    usernameController = TextEditingController(text: loginBloc.state.username);
    passwordController = TextEditingController(text: loginBloc.state.password);
    usernameController.addListener(() {
      loginBloc.setUsername(usernameController.text);
    });
    passwordController.addListener(() {
      loginBloc.setPassword(passwordController.text);
    });
  }

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);
    return Scaffold(
        body: BlocBuilder<StudentBloc, StudentState>(builder: (context, state) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0),
        child: Center(
          child: SafeArea(
            child: PaddedColumn(
              padding: 24.0,
              children: [
                PaddedColumn(
                  padding: 4.0,
                  children: [
                    Text(
                      "Login",
                      style: BlTypography.headlineSmall(context),
                      textAlign: TextAlign.center,
                    ),
                    Text(
                      "Log ind nedenfor med dit normale Lectio login.",
                      textAlign: TextAlign.center,
                      style: BlTypography.bodySmall(context),
                    ),
                  ],
                ),
                PaddedColumn(padding: 12.0, children: [
                  gymnasieInput(state, theme),
                ]),
                OverflowBar(
                    spacing: 8.0,
                    alignment: MainAxisAlignment.center,
                    children: [
                      FilledButton.tonal(
                          onPressed: widget.back, child: const Text("Tilbage")),
                      FilledButton(
                          onPressed: () => loginBloc.login(context),
                          child: const IllustrationHelper(
                              height: 20.0,
                              width: 40.0,
                              primary: Colors.black,
                              svgName: "mitid")),
                    ]),
              ],
            ),
          ),
        ),
      );
    }));
  }

  TextField passwordInput() {
    return TextField(
      controller: passwordController,
      obscureText: hidden,
      decoration: InputDecoration(
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8.0)),
          suffixIcon: IconButton(
              onPressed: () {
                setState(() {
                  hidden = !hidden;
                });
              },
              icon: Icon(hidden ? EvaIcons.eyeOff2 : EvaIcons.eyeOutline)),
          label: const Text("Kodeord"),
          prefixIcon: const Icon(EvaIcons.lockOutline)),
    );
  }

  TextField usernameInput() {
    return TextField(
      controller: usernameController,
      decoration: InputDecoration(
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8.0)),
          label: const Text("Brugernavn"),
          prefixIcon: const Icon(EvaIcons.personOutline)),
    );
  }

  InkWell gymnasieInput(StudentState state, ThemeData theme) {
    return InkWell(
      borderRadius: BorderRadius.circular(8.0),
      onTap: () {
        widget.back();
      },
      child: InputDecorator(
        decoration: InputDecoration(
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(8.0)),
            label: const Text("Gymnasie"),
            prefixIcon: const Icon(EvaIcons.homeOutline)),
        child: Text(
          state.gyms
                  .where((element) => element.id == loginBloc.state.selectedGym)
                  .firstOrNull
                  ?.name ??
              "",
          style: theme.textTheme.bodyLarge,
        ),
      ),
    );
  }
}
